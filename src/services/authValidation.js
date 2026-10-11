const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates registration input. bcrypt only uses the first 72 bytes, so longer passwords are rejected. */
export function validateRegistration(raw = {}) {
  const errors = [];
  const name = String(raw.name ?? '').trim();
  const email = String(raw.email ?? '').trim().toLowerCase();
  const password = String(raw.password ?? '');

  if (name.length < 2 || name.length > 100) errors.push({ field: 'name', message: 'Name must be 2 to 100 characters' });
  if (!EMAIL.test(email) || email.length > 254) errors.push({ field: 'email', message: 'Enter a valid email address' });
  if (password.length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  else if (Buffer.byteLength(password) > 72) errors.push({ field: 'password', message: 'Password must be 72 bytes or fewer' });

  return { errors, value: errors.length ? null : { name, email, password } };
}
