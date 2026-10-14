export async function prepareUpload(files, persistence) {
  // File inputs are reset immediately, and drop-event FileLists expire after dispatch.
  const selected = Array.from(files);
  if (!persistence.canEdit() || !(await persistence.flush())) {
    throw new Error('Save your current changes before uploading.');
  }
  return selected;
}
