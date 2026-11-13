import { LineSkeleton, TilesSkeleton } from '@/components/Skeletons';

/** Shown the instant you navigate, while the server prepares the page. */
export default function Loading() {
  return (
    <div>
      <div className="mb-10 max-w-3xl space-y-4">
        <LineSkeleton className="h-10 w-2/3 bg-ink/10" />
        <LineSkeleton className="w-1/2" />
      </div>
      <TilesSkeleton count={12} />
    </div>
  );
}
