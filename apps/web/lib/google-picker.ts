declare global {
  interface Window {
    gapi: any;
  }
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadGooglePickerScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.gapi?.picker) {
    return Promise.resolve();
  }
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('picker', { callback: () => resolve() });
    };
    script.onerror = () => reject(new Error('Не вдалося завантажити Google Picker'));
    document.body.appendChild(script);
  });
  return scriptLoadingPromise;
}

export async function openGoogleDriveFolderPicker(
  accessToken: string,
  onPicked: (folderId: string, folderName: string) => void,
): Promise<void> {
  await loadGooglePickerScript();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY as string;
  const google = (window as any).google;
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true);
  const picker = new google.picker.PickerBuilder()
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(view)
    .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
      if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
        onPicked(data.docs[0].id, data.docs[0].name);
      }
    })
    .build();
  picker.setVisible(true);
}
