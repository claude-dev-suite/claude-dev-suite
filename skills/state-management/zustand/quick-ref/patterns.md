# Zustand Patterns

> **Knowledge Base:** Read `knowledge/zustand/basics.md` for complete documentation.

## Slices Pattern

```ts
// slices/userSlice.ts
export interface UserSlice {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}

export const createUserSlice: StateCreator<UserSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
});

// slices/cartSlice.ts
export interface CartSlice {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  clearCart: () => void;
}

export const createCartSlice: StateCreator<CartSlice> = (set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  clearCart: () => set({ items: [] }),
});

// store.ts
type Store = UserSlice & CartSlice;

const useStore = create<Store>()((...a) => ({
  ...createUserSlice(...a),
  ...createCartSlice(...a),
}));
```

## Async Actions

```ts
interface Store {
  users: User[];
  loading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
}

const useStore = create<Store>((set) => ({
  users: [],
  loading: false,
  error: null,
  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const users = await api.getUsers();
      set({ users, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
}));
```

## Selectors

```ts
// Define selectors outside store
const selectUser = (state: Store) => state.user;
const selectIsLoggedIn = (state: Store) => !!state.user;
const selectCartTotal = (state: Store) =>
  state.items.reduce((sum, item) => sum + item.price, 0);

// Use in component
function Cart() {
  const total = useStore(selectCartTotal);
  return <span>Total: ${total}</span>;
}

// Memoized selector
import { shallow } from 'zustand/shallow';

function UserInfo() {
  const { name, email } = useStore(
    (state) => ({ name: state.user?.name, email: state.user?.email }),
    shallow
  );
}
```

## Actions Outside React

```ts
// Access store outside components
const { getState, setState, subscribe } = useStore;

// Get current state
const user = useStore.getState().user;

// Update state
useStore.setState({ loading: true });

// Subscribe to changes
const unsubscribe = useStore.subscribe(console.log);
```

## Reset Store

```ts
const initialState = {
  count: 0,
  user: null,
};

const useStore = create<Store>((set) => ({
  ...initialState,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set(initialState),
}));
```

## Computed Values

```ts
const useStore = create<Store>((set, get) => ({
  items: [],
  // Computed via getter
  get totalItems() {
    return get().items.length;
  },
  // Or as derived function
  getTotal: () => get().items.reduce((sum, i) => sum + i.price, 0),
}));
```

**Official docs:** https://docs.pmnd.rs/zustand/guides/slices-pattern
