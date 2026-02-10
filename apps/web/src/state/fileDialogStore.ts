type OpenProjectDialogFn = () => void;

let openProjectDialog: OpenProjectDialogFn | null = null;

export const fileDialogStore = {
  registerProjectOpenDialog(opener: OpenProjectDialogFn | null) {
    openProjectDialog = opener;
  },

  openProjectImportDialog(): boolean {
    if (!openProjectDialog) return false;
    openProjectDialog();
    return true;
  },
};
