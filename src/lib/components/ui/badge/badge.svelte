<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'inline-flex items-center border px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase',
		variants: {
			variant: {
				default: 'border-border bg-muted text-muted-foreground',
				outline: 'border-border text-foreground',
				warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
				destructive: 'border-destructive/30 bg-destructive/10 text-destructive'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & { variant?: BadgeVariant } = $props();
</script>

<span
	bind:this={ref}
	data-slot="badge"
	data-variant={variant}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</span>
