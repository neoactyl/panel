<script lang="ts">
	import { enhance } from '$app/forms';
	import IconMail from '@tabler/icons-svelte/icons/mail';
	import IconSend from '@tabler/icons-svelte/icons/send';
	import IconPlugConnected from '@tabler/icons-svelte/icons/plug-connected';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import IconTemplate from '@tabler/icons-svelte/icons/template';
	import IconBell from '@tabler/icons-svelte/icons/bell';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const feedback = $derived(form as { success?: string; error?: string } | null);

	const input =
		'w-full border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none';
	const label = 'mb-1.5 block text-[11px] font-semibold tracking-wider text-white/50 uppercase';
	const section = 'border border-white/10 bg-[#1a1a1a] p-5 sm:p-6';
	const sectionTitle = 'flex items-center gap-2 text-sm font-bold text-white';
	const checkbox = 'h-4 w-4 accent-indigo-500';
	const secondaryButton =
		'flex items-center gap-2 border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white';

	const templateOptions = $derived(
		data.templates.filter((template) => template.key !== 'layout')
	);
</script>

<svelte:head>
	<title>Email - {data.branding.name}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">Configuration</p>
		<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Email &amp; SMTP</h1>
		<p class="mt-1 max-w-2xl text-sm text-white/45">
			Connect an SMTP server, choose which events trigger an email, and customise every message
			without touching the code. In-app notifications are always stored regardless of these
			settings.
		</p>
	</div>

	{#if feedback?.error}
		<div class="flex items-start gap-2 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
			<IconAlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
			<span>{feedback.error}</span>
		</div>
	{/if}
	{#if feedback?.success}
		<div class="flex items-start gap-2 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
			<IconCheck class="mt-0.5 h-4 w-4 shrink-0" />
			<span>{feedback.success}</span>
		</div>
	{/if}

	<section class={section}>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class={sectionTitle}><IconMail class="h-4 w-4 text-indigo-300" /> SMTP server</h2>
				<p class="mt-1 text-xs text-white/40">
					{data.smtp.configured
						? `Connected as ${data.smtp.fromEmail}`
						: 'Email delivery is not configured yet.'}
				</p>
			</div>
			<form method="POST" action="?/verify" use:enhance>
				<button type="submit" class={secondaryButton}>
					<IconPlugConnected class="h-3.5 w-3.5" />
					Test connection
				</button>
			</form>
		</div>

		<form method="POST" action="?/saveSmtp" use:enhance class="mt-5 space-y-4">
			<label class="flex items-center justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5">
				<span>
					<span class="block text-sm text-white/70">Enable outgoing email</span>
					<span class="mt-0.5 block text-[11px] text-white/35">
						When disabled, no email is sent even if an event is enabled.
					</span>
				</span>
				<input type="checkbox" name="smtp.enabled" class={checkbox} checked={data.smtp.enabled} />
			</label>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class={label} for="smtp.host">SMTP host</label>
					<input
						id="smtp.host"
						name="smtp.host"
						class={input}
						value={data.smtp.host}
						placeholder="smtp.example.com"
					/>
				</div>
				<div>
					<label class={label} for="smtp.port">Port</label>
					<input
						id="smtp.port"
						name="smtp.port"
						type="number"
						min="1"
						max="65535"
						class={input}
						value={data.smtp.port}
					/>
				</div>
			</div>

			<div class="grid gap-2 sm:grid-cols-2">
				<label class="flex items-center justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5">
					<span>
						<span class="block text-sm text-white/70">Implicit TLS</span>
						<span class="mt-0.5 block text-[11px] text-white/35">Usually on for port 465.</span>
					</span>
					<input type="checkbox" name="smtp.secure" class={checkbox} checked={data.smtp.secure} />
				</label>
				<label class="flex items-center justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5">
					<span>
						<span class="block text-sm text-white/70">Require STARTTLS</span>
						<span class="mt-0.5 block text-[11px] text-white/35">
							Upgrade the connection when the server supports it.
						</span>
					</span>
					<input
						type="checkbox"
						name="smtp.requireTls"
						class={checkbox}
						checked={data.smtp.requireTls}
					/>
				</label>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class={label} for="smtp.user">Username</label>
					<input
						id="smtp.user"
						name="smtp.user"
						class={input}
						value={data.smtp.user}
						autocomplete="off"
						placeholder="Optional"
					/>
				</div>
				<div>
					<label class={label} for="smtp.password">Password</label>
					<input
						id="smtp.password"
						name="smtp.password"
						type="password"
						class={input}
						autocomplete="new-password"
						placeholder={data.smtp.passwordSet
							? 'Stored — leave blank to keep it'
							: 'Optional'}
					/>
					{#if data.smtp.passwordSet}
						<label class="mt-2 flex items-center gap-2 text-xs text-white/50">
							<input type="checkbox" name="clearSmtpPassword" class={checkbox} />
							Remove the stored password
						</label>
					{/if}
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class={label} for="smtp.fromEmail">Sender email</label>
					<input
						id="smtp.fromEmail"
						name="smtp.fromEmail"
						type="email"
						class={input}
						value={data.smtp.fromEmail}
						placeholder="no-reply@example.com"
					/>
				</div>
				<div>
					<label class={label} for="smtp.fromName">Sender name</label>
					<input
						id="smtp.fromName"
						name="smtp.fromName"
						class={input}
						value={data.smtp.fromName}
						placeholder={data.branding.name}
					/>
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class={label} for="smtp.replyTo">Reply-to address</label>
					<input
						id="smtp.replyTo"
						name="smtp.replyTo"
						type="email"
						class={input}
						value={data.smtp.replyTo}
						placeholder="Optional"
					/>
				</div>
				<label class="mt-5 flex items-center justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5">
					<span>
						<span class="block text-sm text-white/70">Require verified email</span>
						<span class="mt-0.5 block text-[11px] text-white/35">
							Blocks sign-in until the address is verified.
						</span>
					</span>
					<input
						type="checkbox"
						name="auth.requireEmailVerification"
						class={checkbox}
						checked={data.requireEmailVerification}
					/>
				</label>
			</div>

			<button
				type="submit"
				class="flex items-center gap-2 bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
			>
				<IconCheck class="h-4 w-4" />
				Save SMTP settings
			</button>
		</form>
	</section>

	<section class={section}>
		<h2 class={sectionTitle}><IconBell class="h-4 w-4 text-indigo-300" /> Email events</h2>
		<p class="mt-1 text-xs text-white/40">
			Choose which actions send an email. The address always comes from the account that owns the
			event.
		</p>

		<form method="POST" action="?/saveEvents" use:enhance class="mt-5 space-y-3">
			<div class="grid gap-2 sm:grid-cols-2">
				{#each data.events as event (event.key)}
					<label class="flex items-start justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5">
						<span>
							<span class="block text-sm text-white/70">{event.label}</span>
							<span class="mt-0.5 block text-[11px] leading-snug text-white/35">
								{event.description}
							</span>
						</span>
						<input type="checkbox" name={event.key} class={checkbox} checked={event.enabled} />
					</label>
				{/each}
			</div>

			<button
				type="submit"
				class="flex items-center gap-2 bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
			>
				<IconCheck class="h-4 w-4" />
				Save email events
			</button>
		</form>
	</section>

	<section class={section}>
		<h2 class={sectionTitle}><IconTemplate class="h-4 w-4 text-indigo-300" /> Templates</h2>
		<p class="mt-1 text-xs text-white/40">
			HTML is supported. Use the variables listed under each editor; they are replaced when the
			email is sent. The base layout wraps every message, so edit it once to change the look of
			all emails.
		</p>
		<p class="mt-2 text-[11px] text-white/30">
			Customised templates are written to
			<code class="bg-black/30 px-1.5 py-0.5 font-mono text-white/45">{data.templateFile}</code>.
			Only changed templates are stored there; everything else comes from the built-in defaults.
		</p>

		<div class="mt-5 space-y-3">
			{#each data.templates as template (template.key)}
				<details class="border border-white/10 bg-[#121212]">
					<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
						<span class="flex items-center gap-3">
							<span class="text-sm font-semibold text-white">{template.name}</span>
							{#if template.customized}
								<span class="border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-200 uppercase">
									Customised
								</span>
							{/if}
						</span>
						<span class="text-[11px] text-white/35">{template.key}</span>
					</summary>

					<div class="border-t border-white/10 p-4">
						<p class="mb-4 text-xs text-white/40">{template.description}</p>

						<form method="POST" action="?/saveTemplate" use:enhance class="space-y-4">
							<input type="hidden" name="key" value={template.key} />

							{#if template.key !== 'layout'}
								<div>
									<label class={label} for="subject-{template.key}">Subject</label>
									<input
										id="subject-{template.key}"
										name="subject"
										class={input}
										value={template.subject}
									/>
								</div>
							{/if}

							<div>
								<label class={label} for="body-{template.key}">
									{template.key === 'layout' ? 'Layout HTML' : 'Body HTML'}
								</label>
								<textarea
									id="body-{template.key}"
									name="body"
									rows="16"
									spellcheck="false"
									class="{input} font-mono text-xs leading-relaxed"
								>{template.body}</textarea>
							</div>

							<div>
								<p class={label}>Available variables</p>
								<div class="flex flex-wrap gap-1.5">
									{#each template.variables as variable (variable.key)}
										<span
											class="border border-white/10 bg-black/30 px-2 py-1 font-mono text-[10px] text-white/55"
											title={variable.description}
										>
											{`{{${variable.key}}}`}
										</span>
									{/each}
								</div>
							</div>

							<div class="flex flex-wrap items-center gap-2">
								<button
									type="submit"
									class="flex items-center gap-2 bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400"
								>
									<IconCheck class="h-3.5 w-3.5" />
									Save template
								</button>
								<button
									type="submit"
									formaction="?/resetTemplate"
									class={secondaryButton}
									onclick={() => confirm('Restore this template to the built-in default?')}
								>
									Restore default
								</button>
							</div>
						</form>
					</div>
				</details>
			{/each}
		</div>
	</section>

	<section class={section}>
		<h2 class={sectionTitle}><IconSend class="h-4 w-4 text-indigo-300" /> Send a test</h2>
		<p class="mt-1 text-xs text-white/40">
			Save your SMTP settings first. You can send the generic test message or preview any real
			template with sample values.
		</p>

		<form method="POST" action="?/test" use:enhance class="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
			<div>
				<label class={label} for="test-to">Recipient</label>
				<input
					id="test-to"
					name="to"
					type="email"
					class={input}
					placeholder="you@example.com"
					required
				/>
			</div>
			<div>
				<label class={label} for="test-template">Template</label>
				<select id="test-template" name="templateKey" class={input}>
					<option value="">Generic test message</option>
					{#each templateOptions as template (template.key)}
						<option value={template.key}>{template.name}</option>
					{/each}
				</select>
			</div>
			<button
				type="submit"
				class="flex items-center justify-center gap-2 bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
			>
				<IconSend class="h-4 w-4" />
				Send test
			</button>
		</form>
	</section>
</div>
