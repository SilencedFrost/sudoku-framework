export type Tuple<T, N extends number, R extends T[] = []> = R["length"] extends N ? R : Tuple<T, N, [...R, T]>;
export type Cordinates<T, X extends number, Y extends number> = Tuple<Tuple<T, X>, Y>;
