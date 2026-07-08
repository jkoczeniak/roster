import { cn } from "@roster/ui/utils";

interface RosterLogoProps {
	className?: string;
}

export function RosterLogo({ className }: RosterLogoProps) {
	return (
		<span
			className={cn(
				"text-foreground font-mono font-bold tracking-[0.25em] text-4xl uppercase select-none",
				className,
			)}
			aria-label="Roster"
		>
			Roster
		</span>
	);
}
