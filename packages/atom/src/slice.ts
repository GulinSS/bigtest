import { Operation } from "effection";
import { Option } from "fp-ts/Option";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { Lens } from "monocle-ts";
import { atReadonlyRecord } from "monocle-ts/lib/At/ReadonlyRecord";
import { Subscribable, SymbolSubscribable, Subscription } from '@effection/subscription';

import { Atom } from "./atom";

export interface SliceFromPath<S> {
  <
    K1 extends keyof S,
    K2 extends keyof S[K1],
    K3 extends keyof S[K1][K2],
    K4 extends keyof S[K1][K2][K3],
    K5 extends keyof S[K1][K2][K3][K4]
    >(
    path: [K1, K2, K3, K4, K5]
  ): Slice<S[K1][K2][K3][K4][K5], S>;
  <K1 extends keyof S, K2 extends keyof S[K1], K3 extends keyof S[K1][K2], K4 extends keyof S[K1][K2][K3]>(
    path: [K1, K2, K3, K4]
  ): Slice<S[K1][K2][K3][K4], S>;
  <K1 extends keyof S, K2 extends keyof S[K1], K3 extends keyof S[K1][K2]>(path: [K1, K2, K3]): Slice<S[K1][K2][K3], S>;
  <K1 extends keyof S, K2 extends keyof S[K1]>(path: [K1, K2]): Slice<S[K1][K2], S>;
  <K1 extends keyof S>(path: [K1]): Slice<S[K1], S>;
}

// See https://medium.com/dailyjs/typescript-create-a-condition-based-subset-types-9d902cea5b8c
type FilterFlags<Base, Condition> = {
  [Key in keyof Base]: Base[Key] extends Condition ? Key : never
};

type AllowedNames<Base, Condition> =
  FilterFlags<Base, Condition>[keyof Base];

interface AtRecordSlice<V, T, S> {
  <P extends AllowedNames<T, ReadonlyRecord<K, V>>, K extends string = string>(key: K, p: P): Slice<Option<V>, S>;
}


export class Slice<T, S> implements Subscribable<T, void> {
  private constructor(private atom: Atom<S>, private lens: Lens<S, T>) {}

  static fromPath<S>(a: Atom<S>): SliceFromPath<S> {
    let fromProp = Lens.fromProp<S>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (path: Array<any>) => {
      let lens = fromProp(path[0])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Slice(a, path.slice(1).reduce((acc, prop) => acc.compose(fromProp(prop)), lens)) as any
    }
  }

  get state() {
    return this.atom.get();
  }

  get(): T {
    return this.lens.get(this.state)
  }

  set(value: T): void {
    this.atom.update((state) => {
      return this.lens.set(value)(state);
    });
  }

  update(fn: (value: T) => T): void {
    this.set(fn(this.get()));
  }

  over(fn: (value: T) => T): void {
    this.atom.update((state) => this.lens.set(fn(this.lens.get(state)))(state));
  }

  slice<P extends keyof T>(p: P): Slice<T[P], S> {
    return new Slice(this.atom, this.lens.composeLens(Lens.fromProp<T>()(p)));
  }

  atRecord<V>(): AtRecordSlice<V, T, S> {
    return (key, p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lens2: Lens<T, ReadonlyRecord<typeof key, V>> = Lens.fromProp<T>()(p) as any

      return new Slice(this.atom, this.lens
        .composeLens(lens2)
        .composeLens(atReadonlyRecord<V>().at(key))
      )
    }
  }

  [SymbolSubscribable](): Operation<Subscription<T, void>> {
    return Subscribable.from(this.atom).map((state) => this.lens.get(state) as unknown as T)[SymbolSubscribable]()
  }
}
