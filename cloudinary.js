// ============================================================
// cloudinary.js — subida y borrado de fotos y videos
// ============================================================

const LIMITE_MB = 40;

export async function uploadMedia(file, onProgress) {
  const { cloudName, uploadPreset } = window.APP_CONFIG.cloudinary;

  if (!cloudName || cloudName.startsWith("PEGA_AQUI")) {
    throw new Error("Cloudinary no está configurado todavía. Revisa config.js");
  }
  if (file.size > LIMITE_MB * 1024 * 1024) {
    throw new Error(`El archivo pesa más de ${LIMITE_MB} MB. Graba un video más corto o baja la calidad.`);
  }

  const isVideo = file.type.startsWith("video/");
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${isVideo ? "video" : "image"}/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = JSON.parse(xhr.responseText);
        resolve({
          url: res.secure_url,
          publicId: res.public_id,
          type: isVideo ? "video" : "image",
          // Token de borrado inmediato. Solo llega si el preset tiene activado
          // "Return delete token"; sirve por 10 minutos desde la subida.
          deleteToken: res.delete_token || null,
          subidoEn: Date.now(),
          thumbUrl: isVideo
            ? res.secure_url.replace(/\.[^.]+$/, ".jpg")
            : res.secure_url
        });
      } else {
        reject(new Error("No se pudo subir el archivo. Intenta de nuevo."));
      }
    };

    xhr.onerror = () => reject(new Error("Error de conexión al subir el archivo."));
    xhr.send(formData);
  });
}

// ------------------------------------------------------------
// Borrado
// ------------------------------------------------------------
// Cloudinary NO permite borrar un archivo antiguo desde el navegador: hace falta
// una firma con la API secret, que no puede vivir en una app pública. Entonces:
//
//   1. Si el archivo se subió hace menos de 10 minutos y trae delete_token,
//      se borra al tiro (es el caso típico: subiste la foto equivocada).
//   2. Si configuraste un endpoint propio (una Cloud Function que firma la
//      llamada), se le manda el publicId.
//   3. Si no, se anota el publicId en una lista local de pendientes para poder
//      limpiarlos después desde el panel de Cloudinary.
//
// Nunca lanza: borrar la foto no debe impedir borrar el trabajo o el producto.

const CLAVE_PENDIENTES = "cerrauto_media_pendientes";
const MINUTOS_TOKEN = 10;

export async function borrarMedia(media) {
  if (!media?.publicId) return false;
  const { cloudName, deleteEndpoint } = window.APP_CONFIG.cloudinary || {};

  try {
    const reciente = media.deleteToken
      && media.subidoEn
      && (Date.now() - media.subidoEn) < MINUTOS_TOKEN * 60 * 1000;

    if (reciente) {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/delete_by_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: media.deleteToken })
      });
      if (r.ok) return true;
    }

    if (deleteEndpoint) {
      const r = await fetch(deleteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: media.publicId, type: media.type || "image" })
      });
      if (r.ok) return true;
    }
  } catch (e) {
    console.warn("No se pudo borrar el archivo en Cloudinary:", e);
  }

  anotarPendiente(media);
  return false;
}

function anotarPendiente(media) {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || "[]");
    if (!lista.some(x => x.publicId === media.publicId)) {
      lista.push({ publicId: media.publicId, type: media.type || "image", anotadoEn: Date.now() });
      localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista.slice(-500)));
    }
  } catch {}
}

// Lista de archivos que quedaron en Cloudinary sin borrar, para limpiarlos a mano.
export function mediaPendientesDeBorrar() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || "[]");
  } catch {
    return [];
  }
}

export function limpiarPendientesDeBorrar() {
  try { localStorage.removeItem(CLAVE_PENDIENTES); } catch {}
}
