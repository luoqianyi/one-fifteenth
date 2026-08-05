const dialogRoot = document.querySelector('#dialog-root');
const toastRoot = document.querySelector('#toast-root');

export function openDialog({ eyebrow = 'FIFTEEN / ONE', title, content, confirmLabel = '保存', onConfirm }) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.innerHTML = `
    <form class="dialog-form">
      <div class="dialog-heading"><p class="eyebrow"></p><h2></h2></div>
      <div class="dialog-content"></div>
      <p class="dialog-error" role="alert"></p>
      <div class="dialog-actions">
        <button class="button" type="button" data-action="cancel">取消</button>
        <button class="button primary" type="submit"></button>
      </div>
    </form>`;
  dialog.querySelector('.eyebrow').textContent = eyebrow;
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('.dialog-content').append(content);
  dialog.querySelector('[type="submit"]').textContent = confirmLabel;
  const form = dialog.querySelector('form');
  const submit = dialog.querySelector('[type="submit"]');
  const error = dialog.querySelector('.dialog-error');

  dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    try {
      const shouldClose = await onConfirm(new FormData(form), form, dialog);
      if (shouldClose !== false) dialog.close();
      else submit.disabled = false;
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : '保存失败，请重试';
      submit.disabled = false;
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    previousFocus?.focus();
  });
  dialogRoot.append(dialog);
  dialog.showModal();
  dialog.querySelector('input, select, textarea')?.focus();
  return dialog;
}

export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastRoot.append(toast);
  setTimeout(() => toast.remove(), 4000);
}
