import type {AdminRole} from '../types';
import {assertServerRuntime} from './runtime';
export function roleAllowed(role:AdminRole,roles:readonly AdminRole[]):boolean {assertServerRuntime();return roles.includes(role)}
