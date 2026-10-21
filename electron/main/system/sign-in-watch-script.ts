/**
 * The script that notices a sign-in, so Copacetic can offer to save the
 * password. It runs in an isolated world of its own, which the page can neither
 * see nor reach, and only on a secure page. A page with no field for a password
 * or a username is left at once with nothing behind. On one that has them, it
 * waits for the form to be sent, by a button, Enter or a submit, then reads the
 * fields once, hands them back and removes its listeners.
 */
export const SIGN_IN_WATCH_SCRIPT = `(() => {
  const isVisible = (field) => {
    const rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && !field.disabled;
  };
  const isTextField = (field) => ['text', 'email', 'tel', ''].includes(field.type);
  const isUsernameField = (field) =>
    isTextField(field) &&
    (field.type === 'email' ||
      field.autocomplete.includes('username') ||
      /user|email|login|identifier|account/i.test(field.name + ' ' + field.id));
  const visibleFields = () => Array.from(document.querySelectorAll('input')).filter(isVisible);
  if (!visibleFields().some((field) => field.type === 'password' || isUsernameField(field))) {
    return null;
  }

  // The last password filled in is the one a sign-up or a change of password ends on.
  const read = () => {
    const fields = visibleFields();
    const passwords = fields.filter((field) => field.type === 'password' && field.value);
    const password = passwords[passwords.length - 1];
    if (password) {
      const before = fields.slice(0, fields.indexOf(passwords[0])).reverse();
      const username = before.find((field) => isTextField(field) && field.value);
      return { username: username ? username.value : '', password: password.value };
    }
    const username = fields.find((field) => isUsernameField(field) && field.value);
    return username ? { username: username.value, password: '' } : null;
  };

  return new Promise((resolve) => {
    const settle = () => {
      const found = read();
      if (found) {
        document.removeEventListener('submit', settle, true);
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('click', onClick, true);
        resolve(found);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Enter') {
        settle();
      }
    };
    const onClick = (event) => {
      if (event.target instanceof Element && event.target.closest('button, [role="button"], input[type="submit"], input[type="image"]')) {
        settle();
      }
    };
    document.addEventListener('submit', settle, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
  });
})()`;
