import type { Profil, Role } from './types';

export const aLeRole = (p: Profil | null | undefined, r: Role) => !!p?.roles.includes(r);
