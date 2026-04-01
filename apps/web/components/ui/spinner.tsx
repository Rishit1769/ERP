import { Loader2 } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={`h-6 w-6 animate-spin text-primary ${className ?? ""}`} />;
}

export function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="h-10 w-10" />
    </div>
  );
}
