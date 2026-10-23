export async function processImageFile(
  file: File,
  maxDim = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          reject(new Error('تعذر معالجة الصورة'));
        }
      };
      img.onerror = () => reject(new Error('فشل تحميل الصورة'));
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error('ملف الصورة فارغ'));
      }
    };
    reader.onerror = () => reject(new Error('خطأ في قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });
}
