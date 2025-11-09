const base=import.meta.env.VITE_API_URL||'/api'; export const api=(p='')=>`${base}${p}`;
