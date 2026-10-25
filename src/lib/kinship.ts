/** The order of kinship degrees (the church's nomenclature): rank of a degree, unknown last. Pure. */
export const kinshipRank = (rudenieOrder: string[]) => (r: string) => {
  const i = rudenieOrder.indexOf(r);
  return i < 0 ? 99 : i;
};
