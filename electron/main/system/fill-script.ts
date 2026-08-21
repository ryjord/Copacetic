/**
 * The only code Copacetic ever runs inside a page, injected once when you ask
 * it to fill a password and never otherwise. It reads no page content, returns
 * only whether it found a field, and leaves nothing behind — there is no
 * listener, no global, and nothing the page can call afterwards.
 *
 * It runs in the page's own world, so the page could observe the value being
 * set. That is not a leak: the value is a password you are deliberately giving
 * that page, and it would see it the moment you typed it by hand.
 */
export function fillScriptFor(username: string, password: string): string {
  // Serialised as JSON so a password containing quotes or newlines cannot end
  // the string and become code.
  return `(() => {
  const username = ${JSON.stringify(username)};
  const password = ${JSON.stringify(password)};

  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && element.type !== 'hidden' && !element.disabled && !element.readOnly;
  };

  const passwordField = Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible);
  if (!passwordField) {
    return { filled: false, reason: 'no-password-field' };
  }

  // React and friends listen for input events rather than watching the value,
  // so setting it directly leaves the page's own state stale and the form
  // submits empty.
  const setValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  let filledUsername = false;
  if (username) {
    const form = passwordField.form;
    const candidates = Array.from((form || document).querySelectorAll('input'));
    const before = candidates.slice(0, candidates.indexOf(passwordField));
    const usernameField = before
      .reverse()
      .find((field) => isVisible(field) && ['text', 'email', 'tel', ''].includes(field.type));
    if (usernameField) {
      setValue(usernameField, username);
      filledUsername = true;
    }
  }

  setValue(passwordField, password);
  passwordField.focus();

  // A single-line input drops newlines and carriage returns, so a password
  // containing one arrives shorter than it was saved. Compared here rather than
  // assumed: the alternative is a sign-in that fails for no visible reason.
  return { filled: true, filledUsername, exact: passwordField.value === password };
})()`;
}
