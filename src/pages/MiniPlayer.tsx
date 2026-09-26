import { usePlayerStore } from '../store';
import { useDominantColor } from '../utils/color';
import { Artwork, IconButton } from '../components/ui';
import { SeekBar, VolumeControl, PlayButton, LikeButton } from '../components/PlayerBar';

export default function MiniPlayer() {
  const track = usePlayerStore((s) => s.currentTrack);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const color = useDominantColor(track?.thumbnail);

  if (!track) {
    return (
      <div className="h-[100dvh] w-full flex flex-col items-center justify-center gap-2 bg-background text-on-surface-variant p-8 text-center">
        <span aria-hidden className="material-symbols-outlined text-4xl">music_note</span>
        <p className="text-sm">Nothing playing</p>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full flex flex-col gap-3 p-4 text-white overflow-hidden select-none bg-surface-container-low">
      <div aria-hidden className="absolute inset-0 transition-colors duration-700" style={color ? { backgroundColor: color } : undefined} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/70" />
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <div style={{ width: 'min(100%, calc(100dvh - 12rem))' }}>
          <Artwork key={track.id} src={track.thumbnail} alt={`${track.title} artwork`} size="fill" rounded="xl" priority className="shadow-elevated" />
        </div>
      </div>
      <div className="relative flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold truncate">{track.title}</p>
          <p className="text-sm text-white/70 truncate">{track.artist}</p>
        </div>
        <LikeButton track={track} overlay />
      </div>
      <SeekBar overlay stacked className="relative" />
      <div className="relative flex items-center justify-center gap-4">
        <IconButton icon="skip_previous" label="Previous" size="lg" filled onClick={prevTrack} className="!text-white hover:!bg-white/10" />
        <PlayButton size="lg" />
        <IconButton icon="skip_next" label="Next" size="lg" filled onClick={() => nextTrack()} className="!text-white hover:!bg-white/10" />
      </div>
      <VolumeControl overlay className="relative" />
    </div>
  );
}
