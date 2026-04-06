import type { CloudinaryUploadResult } from "../types";

export async function uploadImageToCloudinary(
  imageUri: string
): Promise<CloudinaryUploadResult> {
  const formData = new FormData();

  formData.append("file", {
    uri: imageUri,
    type: "image/jpeg",
    name: "incident.jpg",
  } as any);

  formData.append("upload_preset", "incident_reports_image");
  formData.append("folder", "incident_reports");

  const response = await fetch(
    "https://api.cloudinary.com/v1_1/dfyelumhb/image/upload",
    {
      method: "POST",
      body: formData,
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.error?.message || "Cloudinary upload failed");
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}
