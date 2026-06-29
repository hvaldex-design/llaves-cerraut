// ============================================================
// cloudinary.js — subida de fotos y videos
// ============================================================

export async function uploadMedia(file, onProgress) {
  const { cloudName, uploadPreset } = window.APP_CONFIG.cloudinary;

  if (!cloudName || cloudName.startsWith("PEGA_AQUI")) {
    throw new Error("Cloudinary no está configurado todavía. Revisa config.js");
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
