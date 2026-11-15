// Modal dialogs for the two questions the runtime must ask the visitor: contact another site, confirm a write.
import type { Confirm, Consent } from '@aw/runtime';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function open(dialog: HTMLDialogElement, focusId: string): Promise<string> {
  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue);
    };
    dialog.returnValue = '';
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    document.getElementById(focusId)?.focus();
  });
}

export const consentDialog: Consent = async (req) => {
  const dialog = el<HTMLDialogElement>('consent');
  el('consent-text').textContent = `The agent wants to ask ${req.label}, a network published by another site. Its agents would run in this browser, with your model. Nothing is sent until you allow it.`;
  el('consent-origin').textContent = req.origin;
  el('consent-sent').textContent = `${req.purpose}. Only the short request text is sent.`;
  const value = await open(dialog, 'consent-deny');
  if (value === 'allow') return 'allow';
  if (value === 'allow_session') return 'allow_session';
  return 'deny';
};

export const confirmDialog: Confirm = async (req) => {
  const dialog = el<HTMLDialogElement>('confirm');
  el('confirm-text').textContent = req.text;
  el('confirm-action').textContent = `${req.action} (${req.effect})`;
  el('confirm-origin').textContent = req.origin;
  el('confirm-args').textContent = JSON.stringify(req.args);
  const value = await open(dialog, 'confirm-no');
  return value === 'yes';
};
