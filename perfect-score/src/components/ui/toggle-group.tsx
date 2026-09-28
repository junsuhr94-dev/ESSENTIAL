import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn('inline-flex rounded-lg bg-secondary p-1', className)} {...props} />;
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors data-[state=on]:bg-primary data-[state=on]:text-primary-foreground [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
