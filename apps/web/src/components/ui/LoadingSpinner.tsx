export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-2 border-border-primary"></div>
        <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-brand-blue absolute top-0 left-0 animate-spin"></div>
      </div>
    </div>
  );
}
