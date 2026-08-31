import type { CozyKinApi } from '../shared/ipc';

declare global {
  interface Window { cozykin: CozyKinApi }
}

export {};
