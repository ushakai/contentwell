import { supabase } from "./supabaseClient";

let uploadCount = 0; // Count how many images uploaded

export async function uploadBase64Image(base64: string, path: string) {
  console.log("🔄 Starting image upload...");

  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  console.log("📦 Uploading to bucket: generated_images");
  console.log("📁 Upload path:", path);

  const { data, error } = await supabase.storage
    .from("generated_images")
    .upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    console.error("❌ Upload failed:", error);
    throw error;
  }

  uploadCount++;
  console.log(`✅ Image uploaded successfully. Total images uploaded: ${uploadCount}`);

  // Return public URL
  const { data: publicUrlData } = supabase.storage
    .from("generated_images")
    .getPublicUrl(path);

  console.log("🔗 Public URL:", publicUrlData.publicUrl);
  console.log("📌 Saved generated_image_path:", path);

  return publicUrlData.publicUrl;
}
