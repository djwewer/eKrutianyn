declare global {
  interface Window {
    gapi?: any;
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

function buildPicker(
  accessToken: string,
  view: any,
  onPicked: (id: string, name: string) => void,
): any {
  const google = (window as any).google;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY as string;
  const appId = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER as string;
  const builder = new google.picker.PickerBuilder()
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(view)
    .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
      if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
        onPicked(data.docs[0].id, data.docs[0].name);
      }
    });
  // Required for the drive.file-scoped OAuth token to actually be granted
  // access to the picked item — without it, the pick succeeds visually but
  // the app's token still can't read the file afterwards (404s as "not found").
  if (appId) builder.setAppId(appId);
  return builder.build();
}

export async function openGoogleDriveFolderPicker(
  accessToken: string,
  onPicked: (folderId: string, folderName: string) => void,
): Promise<void> {
  await loadGooglePickerScript();
  const google = (window as any).google;
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true);
  buildPicker(accessToken, view, onPicked).setVisible(true);
}

export async function openGoogleSheetPicker(
  accessToken: string,
  onPicked: (spreadsheetId: string, spreadsheetName: string) => void,
): Promise<void> {
  await loadGooglePickerScript();
  const google = (window as any).google;
  const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
  buildPicker(accessToken, view, onPicked).setVisible(true);
}
