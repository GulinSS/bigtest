import { Operation } from "effection";
import { Lens } from "monocle-ts";
import { Atom } from "./atom";
import { Subscribable, SymbolSubscribable, Subscription } from '@effection/subscription';

function deleteObjKey<T>(prop: keyof T, v: T): T {
  let copy = {
    ...v
  }

  delete copy[prop]

  return copy
}

export class Slice<T, S> implements Subscribable<T, void> {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  lens: Lens<S, T>;

  constructor(private atom: Atom<S>, public path: ReadonlyArray<string | number>) {
    // TODO: it was not typesafe, it will not be typesafe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.lens = Lens.fromPath<S>()(path as any) as any;
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

  slice<T>(path: ReadonlyArray<string>): Slice<T, S> {
    return new Slice(this.atom, this.path.concat(path));
  }

  remove(): void {
    // If this is the root, then it cannot be removed.
    if (this.path.length === 0) {
      return;
    }

    let parentPath = this.path.slice(0, -1);
    // TODO: it was not typesafe, it will not be typesafe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parentLens: Lens<S, any> = Lens.fromPath<S>()(parentPath as any) as any;
    let parent = parentLens.get(this.state);
    if (Array.isArray(parent)) {
      this.atom.update((state) => {
        let array = parent as unknown[];
        return parentLens.set(array.filter((el) => el !== this.get()))(state);
      });
    } else {
      let [property] = this.path.slice(-1);
      this.atom.update((state) => {
        return parentLens.set(deleteObjKey(parent, property))(state)
      });
    }
  }

  [SymbolSubscribable](): Operation<Subscription<T, void>> {
    return Subscribable.from(this.atom).map((state) => this.lens.get(state) as unknown as T)[SymbolSubscribable]()
  }
}
