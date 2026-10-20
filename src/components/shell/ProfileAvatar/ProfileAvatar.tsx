'use client';

// Libs
import { useEffect, useState } from 'react';

// Utils
import { ask } from '@/lib/bridge/bridge';
import { cn } from '@/lib/utils';
import { initialsOf } from '@shared/data/profiles';
import { colourOf } from '@shared/tabs/tab-groups';

// Types
import type { ProfileSummary } from '@shared/data/profiles';

const SIZES = {
  small: 'size-6 text-caption',
  large: 'size-12 text-body',
} as const;

/** A profile's photo, or its initials on its colour when it has none. */
export function ProfileAvatar({ profile, size = 'small' }: { profile: ProfileSummary; size?: keyof typeof SIZES }) {
  const picture = useProfilePicture(profile);
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white',
        SIZES[size],
      )}
      style={{ background: colourOf(profile.colour) }}
    >
      {picture ? (
        // A data URL from the profile's own folder; next/image has nothing to offer a static export.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className="size-full object-cover" />
      ) : (
        initialsOf(profile.name)
      )}
    </span>
  );
}

/** Asked for once per version, so a state push that changed nothing about the picture does not fetch it again. */
function useProfilePicture(profile: ProfileSummary): string | null {
  const [loaded, setLoaded] = useState<{ key: string; picture: string | null } | null>(null);
  const key = profile.pictureVersion === null ? null : `${profile.id}:${profile.pictureVersion}`;

  useEffect(() => {
    if (key === null) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.profiles.picture(profile.id), null).then((picture) => {
      if (isCurrent) {
        setLoaded({ key, picture });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [key, profile.id]);

  return key !== null && loaded?.key === key ? loaded.picture : null;
}
