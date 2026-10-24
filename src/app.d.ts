import type { User, Session } from 'better-auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			panelUserId?: string;
		}

		interface Error {
			message: string;
			reference?: string;
		}

		namespace Superforms {
			type Message = string | { status: 'success' | 'error'; text: string; serverId?: string };
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
