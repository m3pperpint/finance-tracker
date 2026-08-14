<script lang="ts">
    import { cn } from '$lib/utils'

    export let variant: 'default' | 'outline' | 'ghost' = 'default'
    export let size: 'default' | 'sm' | 'icon' = 'default'
    export let type: 'button' | 'submit' = 'button'
    export let disabled = false
    export let className = ''

    const variants = {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        outline:
            'border border-border bg-card text-foreground shadow-sm hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    }
    const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        icon: 'h-10 w-10',
    }
</script>

<button
    {type}
    {disabled}
    class={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
    )}
    {...$$restProps}
>
    <slot />
</button>
