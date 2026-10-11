/**
 * ย่อรูปถ่ายบิลก่อนอัปโหลด (ด้านยาวสุด 1800px · JPEG) — รูปจากมือถือหลาย MB เหลือราว 200–400 KB
 * ไฟล์ที่ไม่ใช่รูป (เช่น PDF) หรือรูปเล็กอยู่แล้ว ส่งคืนตามเดิม
 */
export async function shrinkImage(file: File, maxSide = 1800, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 350_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
