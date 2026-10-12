export class BusyOperations {
  private readonly active = new Set<symbol>();
  constructor(private readonly onChange: (count: number) => void) {}

  begin() {
    const token = Symbol("busy-operation");
    this.active.add(token);
    this.onChange(this.active.size);
    return () => {
      if (this.active.delete(token)) this.onChange(this.active.size);
    };
  }
}
