/**
 * The home page shows a fixed row of bestsellers under the hero, so the catalogue can only hold
 * that many. The limit lives here because both ends need it: the admin form dims the box once the
 * slots are taken, and the data layer refuses a write that would exceed it.
 */
export const BESTSELLER_SLOTS = 4;
