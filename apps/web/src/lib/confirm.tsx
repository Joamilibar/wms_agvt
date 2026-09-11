import toast from 'react-hot-toast';

interface ConfirmOptions {
  title: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * A confirmation the app controls, replacing `window.confirm`.
 *
 * The native dialog blocks the whole page, cannot say which action is
 * destructive, and is unstyleable — so a warning as consequential as archiving
 * the inventory read exactly like a routine prompt. Resolves false if dismissed.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const {
    title,
    detail,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
  } = options;

  return new Promise((resolve) => {
    const id = toast.custom(
      (t) => (
        <div
          role="alertdialog"
          aria-label={title}
          className={`max-w-sm w-full bg-bg-secondary border border-border-primary rounded-xl shadow-lg p-4 ${
            t.visible ? 'animate-in' : 'opacity-0'
          }`}
        >
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          {detail && <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{detail}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => { toast.dismiss(id); resolve(false); }}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary rounded-lg"
            >
              {cancelLabel}
            </button>
            <button
              autoFocus
              onClick={() => { toast.dismiss(id); resolve(true); }}
              className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg ${
                danger ? 'bg-brand-red hover:bg-brand-red/90' : 'bg-brand-blue hover:bg-brand-blue/90'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity },
    );
  });
}
