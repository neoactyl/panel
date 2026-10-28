import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const response = () =>
	json(
		{
			error: 'This endpoint only accepts WebSocket upgrade requests.',
			transport: 'websocket'
		},
		{ status: 426, headers: { 'cache-control': 'no-store', upgrade: 'websocket' } }
	);

export const GET: RequestHandler = () => response();
