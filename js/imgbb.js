// js/imgbb.js

const FALLBACK_IMGBB_KEY = "9a6bc6256c8f61ac7df85be0514643b8";

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

function getImgBBKey() {
  // 1) window global
  try {
    if (typeof window !== "undefined" && window.IMGBB_API_KEY) {
      const k = String(window.IMGBB_API_KEY).trim();
      if (k) return k;
    }
  } catch (e) {}

  // 2) localStorage
  try {
    const v = localStorage.getItem("IMGBB_API_KEY");
    if (v && String(v).trim()) return String(v).trim();
  } catch (e) {}

  // 3) fallback
  return FALLBACK_IMGBB_KEY;
}

export async function imgbbUpload(file, apiKey) {
  if (!file) throw new Error("File topilmadi");
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("ImgBB API key topilmadi");

  const base64Image = await fileToBase64(file);
  const formData = new FormData();
  formData.append("image", base64Image);

  const res = await fetch(
    `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,
    { method: "POST", body: formData }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error?.message || "Image upload failed");
  }

  return data?.data?.url || data?.data?.display_url;
}

export async function uploadToImgBB(file) {
  const apiKey = getImgBBKey();
  return imgbbUpload(file, apiKey);
}

// eski importlar buzilmasin:
export default uploadToImgBB;