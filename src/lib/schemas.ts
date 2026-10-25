import { z } from 'zod';

/** Schema for button-only forms (no fields, e.g. sign out / revoke sessions). */
export const emptySchema = z.object({});

export const loginSchema = z.object({
	email: z.email('Enter a valid email address.'),
	password: z.string().min(1, 'Password is required.')
});

export const registerSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Name is required.')
			.max(100, 'Name must be 100 characters or fewer.'),
		email: z.email('Enter a valid email address.'),
		password: z.string().min(8, 'Password must be at least 8 characters.'),
		confirmPassword: z.string(),
		ref: z.string().optional()
	})
	.refine((d) => d.password === d.confirmPassword, {
		path: ['confirmPassword'],
		message: 'Passwords do not match.'
	});

export const setupSettingsSchema = z.object({
	appName: z
		.string()
		.trim()
		.min(2, 'The app name must be at least 2 characters.')
		.max(48, 'The app name must be 48 characters or fewer.'),
	description: z.string().trim().max(160, 'The description is too long.'),
	logo: z.string().trim(),
	adapter: z.enum(['mock', 'calagopus']),
	panelUrl: z.string().trim(),
	panelToken: z.string().optional().default('')
});

export const setupCreateSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, 'Name, email, and password are required.')
			.max(100, 'Name is too long.'),
		email: z.email('Enter a valid email address.'),
		password: z.string().min(8, 'Password must be at least 8 characters.'),
		confirmPassword: z.string(),
		appName: setupSettingsSchema.shape.appName,
		description: setupSettingsSchema.shape.description,
		logo: setupSettingsSchema.shape.logo,
		adapter: setupSettingsSchema.shape.adapter,
		panelUrl: setupSettingsSchema.shape.panelUrl,
		panelToken: setupSettingsSchema.shape.panelToken
	})
	.refine((d) => d.password === d.confirmPassword, {
		path: ['confirmPassword'],
		message: 'Passwords do not match.'
	});

export const profileSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Name must be at least 2 characters long.')
		.max(64, 'Name must be 64 characters or fewer.')
});

export const passwordSchema = z
	.object({
		currentPassword: z.string().min(1, 'All fields are required.'),
		newPassword: z.string().min(8, 'New password must be at least 8 characters long.'),
		confirmPassword: z.string().min(1, 'All fields are required.')
	})
	.refine((d) => d.newPassword === d.confirmPassword, {
		path: ['confirmPassword'],
		message: 'New passwords do not match.'
	});

export const panelSchema = z.object({
	email: z.email('Enter a valid panel email address.'),
	password: z.string().min(1, 'Panel email and password are required.')
});

const policyLimit = () =>
	z.preprocess(
		(v) => {
			const raw = typeof v === 'string' ? v.trim() : v;
			return raw === '' || raw === undefined || raw === null ? null : Number(raw);
		},
		z
			.number({ message: 'Resource limits must be positive whole numbers.' })
			.int('Resource limits must be positive whole numbers.')
			.min(0, 'Resource limits must be positive whole numbers.')
			.nullable()
	);

export const softwarePolicySchema = z
	.object({
		visible: z.preprocess((v) => v === 'on' || v === true, z.boolean()),
		minCpu: policyLimit(),
		maxCpu: policyLimit(),
		minMemory: policyLimit(),
		maxMemory: policyLimit(),
		minDisk: policyLimit(),
		maxDisk: policyLimit(),
		editableVariables: z.array(z.string().trim().min(1).max(100)).default([]),
		environment: z.string(),
		dockerImage: z.string().trim().max(255, 'The Docker image name is too long.'),
		startupCommand: z.string().trim().max(2000, 'The startup command is too long.')
	})
	.refine((d) => !(d.minCpu !== null && d.maxCpu !== null && d.minCpu > d.maxCpu), {
		path: ['minCpu'],
		message: 'Minimum CPU cannot be greater than maximum CPU.'
	})
	.refine((d) => !(d.minMemory !== null && d.maxMemory !== null && d.minMemory > d.maxMemory), {
		path: ['minMemory'],
		message: 'Minimum memory cannot be greater than maximum memory.'
	})
	.refine((d) => !(d.minDisk !== null && d.maxDisk !== null && d.minDisk > d.maxDisk), {
		path: ['minDisk'],
		message: 'Minimum disk cannot be greater than maximum disk.'
	});

export type SoftwarePolicyFields = z.infer<typeof softwarePolicySchema>;

export const roleSchema = z.object({
	userId: z.string(),
	role: z.enum(['admin', 'user'], { message: 'Invalid role.' })
});

export const banSchema = z.object({
	userId: z.string(),
	banned: z.preprocess((v) => String(v) === 'true', z.boolean())
});

const blankableNumber = (message: string, minimum: number) =>
	z.preprocess(
		(v) => {
			const raw = typeof v === 'string' ? v.trim() : v;
			return raw === '' || raw === undefined || raw === null ? null : Number(raw);
		},
		z
			.number({ message })
			.int(message)
			.min(minimum, message)
			.nullable()
	);

export const userQuotaSchema = z.object({
	cpu: blankableNumber('Resource values must be positive whole numbers.', 1),
	memory: blankableNumber('Resource values must be positive whole numbers.', 1),
	disk: blankableNumber('Resource values must be positive whole numbers.', 1),
	maxServers: blankableNumber('Resource values must be positive whole numbers.', 0),
	maxDatabases: blankableNumber('Resource values must be positive whole numbers.', 0),
	maxAllocations: blankableNumber('Resource values must be positive whole numbers.', 0)
});

export const grantSchema = z.object({
	amount: blankableNumber('Enter a positive whole number of credits.', 1),
	description: z
		.string()
		.trim()
		.max(200, 'The credit note must be 200 characters or fewer.')
});

const sfBool = z.preprocess((v) => v === 'on' || v === true, z.boolean());

const storefrontNumber = (message: string, minimum: number) =>
	z.preprocess(
		(v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 0 : Number(v)),
		z.number({ message }).int(message).min(minimum, message)
	);

const storefrontResource = z.preprocess(
	(v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? null : Number(v)),
	z
		.number({ message: 'CPU, memory, and disk must be whole numbers.' })
		.int('CPU, memory, and disk must be whole numbers.')
		.min(0, 'CPU, memory, and disk must be whole numbers.')
		.nullable()
);

export const storefrontItemSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, 'Storefront name must be between 2 and 80 characters.')
		.max(80, 'Storefront name must be between 2 and 80 characters.'),
	description: z
		.string()
		.trim()
		.max(500, 'Description and success fields must be 500 characters or fewer.'),
	icon: z
		.preprocess(
			(v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 'package' : v),
			z.string().trim().max(50, 'The icon must be 50 characters or fewer.')
		),
	kind: z.preprocess(
		(v) => (v === 'resource' ? 'resource' : 'server'),
		z.enum(['server', 'resource'], { message: 'Choose a valid item kind.' })
	),
	enabled: sfBool,
	oncePerUser: sfBool,
	renewable: sfBool,
	stackable: sfBool,
	removable: sfBool,
	price: storefrontNumber('Price, renewal price, and duration must be valid numbers.', 0),
	renewalPrice: storefrontNumber('Price, renewal price, and duration must be valid numbers.', 0),
	durationDays: z.preprocess(
		(v) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? 30 : Number(v)),
		z
			.number({ message: 'Price, renewal price, and duration must be valid numbers.' })
			.int('Price, renewal price, and duration must be valid numbers.')
			.min(1, 'Price, renewal price, and duration must be valid numbers.')
	),
	cpu: storefrontResource,
	memory: storefrontResource,
	disk: storefrontResource,
	node: z.string().trim().default(''),
	softwareGroup: z.string().trim().default(''),
	software: z.string().trim().default(''),
	successMode: z.preprocess(
		(v) => (v === 'redirect' || v === 'message' ? v : 'console'),
		z.enum(['console', 'redirect', 'message'], { message: 'Choose a valid post-claim action.' })
	),
	successUrl: z
		.string()
		.trim()
		.max(500, 'Description and success fields must be 500 characters or fewer.'),
	successMessage: z
		.string()
		.trim()
		.max(500, 'Description and success fields must be 500 characters or fewer.'),
	sortOrder: storefrontNumber('Price, renewal price, and duration must be valid numbers.', 0)
});

export type StorefrontItemFields = z.infer<typeof storefrontItemSchema>;

export const storefrontClaimSchema = z.object({
	itemId: z.string().trim().min(1, 'Choose a storefront item.'),
	serverId: z.string().default('')
});

export const storefrontRenewalSchema = z.object({
	serverId: z.string().trim().min(1, 'Choose a server.'),
	enabled: sfBool
});

export const storefrontRenewSchema = z.object({
	serverId: z.string().trim().min(1, 'Choose a server.')
});
