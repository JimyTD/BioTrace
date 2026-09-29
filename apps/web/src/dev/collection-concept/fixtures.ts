import type { CollectionEntry, PetCollectionEntry } from "../../api";
import { draftCopy } from "./copy";

const entry = (id: string, name: string, scientificName: string, rarity: CollectionEntry["rarity"], image: string, kingdom: string): CollectionEntry => ({
  id, taxonKey: scientificName, commonName: name, scientificName, rarity,
  coverObservationId: id, coverDisplayUrl: image,
  firstCollectedAt: "2026-09-18T08:00:00Z", updatedAt: "2026-09-18T08:00:00Z",
  taxonomy: { kingdom: { name_la: kingdom, name_zh: null } } as CollectionEntry["taxonomy"],
});

// Visual-review specimens, not identification results or user collection records.
export const sampleEntries = [
  entry("butterfly", draftCopy.sampleButterfly, "Lepidoptera", "SR", "/themes/_demo/demo-photo-butterfly.jpg", "Animalia"),
  entry("mushroom", draftCopy.sampleMushroom, "Agaricales", "R", "/themes/_demo/demo-photo-mushroom.jpg", "Fungi"),
  entry("squirrel", draftCopy.sampleSquirrel, "Sciuridae", "R", "/themes/_demo/demo-photo-squirrel.jpg", "Animalia"),
  entry("dragonfly", draftCopy.sampleDragonfly, "Odonata", "N", "/themes/_demo/demo-photo-dragonfly.jpg", "Animalia"),
  entry("bird", draftCopy.sampleBird, "Aves", "R", "/themes/_demo/demo-photo-bird.jpg", "Animalia"),
];

export const samplePets: PetCollectionEntry[] = [
  { ...entry("cat", draftCopy.sampleCat, "Felis catus", "N", "/proto/pets-page/cat-orange.jpg", "Animalia"), tags: ["domesticated"] },
  { ...entry("dog", draftCopy.sampleDog, "Canis lupus", "N", "/proto/pets-page/dog-corgi.jpg", "Animalia"), tags: ["domesticated"] },
];
