export function classNames(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(" ")
}

export function toPct(n: number) {
  return Math.round(n * 100)
}
