import { useEffect, useState } from "react";
import { memberApi } from "./api";

const imageUrlCache = new Map<string, string>();
const imageRequestCache = new Map<string, Promise<string | null>>();
const generationByMemberId = new Map<number, number>();
let cacheGeneration = 0;

function cacheKey(memberId: number, revision?: number) {
  return `${memberId}:${revision ?? "current"}`;
}

function loadProfileImage(memberId: number, revision?: number) {
  const key = cacheKey(memberId, revision);
  if (imageUrlCache.has(key)) {
    return Promise.resolve(imageUrlCache.get(key) ?? null);
  }

  const pendingRequest = imageRequestCache.get(key);
  if (pendingRequest) return pendingRequest;

  const generation = generationByMemberId.get(memberId) ?? 0;
  const currentCacheGeneration = cacheGeneration;
  const request = memberApi
    .getProfileImage(memberId, revision)
    .then((blob) => {
      const imageUrl = URL.createObjectURL(blob);
      if (
        cacheGeneration !== currentCacheGeneration ||
        (generationByMemberId.get(memberId) ?? 0) !== generation
      ) {
        URL.revokeObjectURL(imageUrl);
        return null;
      }

      imageUrlCache.set(key, imageUrl);
      return imageUrl;
    })
    .catch(() => null)
    .finally(() => {
      if (imageRequestCache.get(key) === request) {
        imageRequestCache.delete(key);
      }
    });

  imageRequestCache.set(key, request);
  return request;
}

export function clearProfileImageCache(memberId?: number) {
  if (memberId === undefined) {
    cacheGeneration += 1;
    imageUrlCache.forEach((imageUrl) => {
      URL.revokeObjectURL(imageUrl);
    });
    imageUrlCache.clear();
    imageRequestCache.clear();
    generationByMemberId.clear();
    return;
  }

  generationByMemberId.set(
    memberId,
    (generationByMemberId.get(memberId) ?? 0) + 1,
  );

  const memberKeyPrefix = `${memberId}:`;
  imageUrlCache.forEach((imageUrl, key) => {
    if (!key.startsWith(memberKeyPrefix)) return;
    URL.revokeObjectURL(imageUrl);
    imageUrlCache.delete(key);
  });
  imageRequestCache.forEach((_, key) => {
    if (key.startsWith(memberKeyPrefix)) imageRequestCache.delete(key);
  });
}

export function useProfileImageUrl(
  memberId: number | null,
  revision?: number,
) {
  const key = memberId === null ? null : cacheKey(memberId, revision);
  const [imageUrl, setImageUrl] = useState<string | null>(() =>
    key === null ? null : imageUrlCache.get(key) ?? null);

  useEffect(() => {
    if (memberId === null || key === null) {
      setImageUrl(null);
      return;
    }

    let active = true;
    setImageUrl(imageUrlCache.get(key) ?? null);
    void loadProfileImage(memberId, revision).then((loadedImageUrl) => {
      if (active) setImageUrl(loadedImageUrl);
    });

    return () => {
      active = false;
    };
  }, [key, memberId, revision]);

  return imageUrl;
}
