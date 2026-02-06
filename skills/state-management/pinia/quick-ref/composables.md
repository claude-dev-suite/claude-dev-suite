# Pinia with Composables Quick Reference

> **Knowledge Base:** Read `knowledge/pinia/composables.md` for complete documentation.

## Store + Composable Pattern

```typescript
// stores/auth.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value);

  async function login(credentials: Credentials) {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.login(credentials);
      token.value = response.token;
      user.value = response.user;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Login failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
  }

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
  };
});

// composables/useAuth.ts
export function useAuth() {
  const store = useAuthStore();
  const router = useRouter();

  async function loginAndRedirect(credentials: Credentials) {
    await store.login(credentials);
    router.push('/dashboard');
  }

  async function logoutAndRedirect() {
    store.logout();
    router.push('/login');
  }

  return {
    ...storeToRefs(store),
    login: store.login,
    logout: store.logout,
    loginAndRedirect,
    logoutAndRedirect,
  };
}
```

## Data Fetching Store

```typescript
// stores/users.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  const userById = computed(() => {
    return (id: number) => users.value.find(u => u.id === id);
  });

  async function fetchUsers() {
    if (users.value.length > 0) return; // Cache check

    loading.value = true;
    error.value = null;

    try {
      users.value = await api.getUsers();
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(data: CreateUserDTO) {
    const user = await api.createUser(data);
    users.value.push(user);
    return user;
  }

  async function updateUser(id: number, data: UpdateUserDTO) {
    const updated = await api.updateUser(id, data);
    const index = users.value.findIndex(u => u.id === id);
    if (index !== -1) {
      users.value[index] = updated;
    }
    return updated;
  }

  async function deleteUser(id: number) {
    await api.deleteUser(id);
    users.value = users.value.filter(u => u.id !== id);
  }

  function $reset() {
    users.value = [];
    loading.value = false;
    error.value = null;
  }

  return {
    users,
    loading,
    error,
    userById,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    $reset,
  };
});
```

## Form Store

```typescript
// stores/userForm.ts
import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';

export const useUserFormStore = defineStore('userForm', () => {
  const form = reactive({
    name: '',
    email: '',
    role: 'user',
  });

  const errors = reactive<Record<string, string>>({});
  const touched = reactive<Record<string, boolean>>({});
  const submitting = ref(false);

  const isValid = computed(() =>
    Object.keys(errors).length === 0 &&
    Object.values(touched).some(Boolean)
  );

  function validate() {
    // Clear errors
    Object.keys(errors).forEach(key => delete errors[key]);

    if (!form.name) {
      errors.name = 'Name is required';
    }

    if (!form.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      errors.email = 'Invalid email format';
    }

    return Object.keys(errors).length === 0;
  }

  function touch(field: string) {
    touched[field] = true;
    validate();
  }

  function setForm(data: Partial<typeof form>) {
    Object.assign(form, data);
  }

  function reset() {
    form.name = '';
    form.email = '';
    form.role = 'user';
    Object.keys(errors).forEach(key => delete errors[key]);
    Object.keys(touched).forEach(key => delete touched[key]);
  }

  return {
    form,
    errors,
    touched,
    submitting,
    isValid,
    validate,
    touch,
    setForm,
    reset,
  };
});
```

## Store Composition

```typescript
// stores/dashboard.ts
import { defineStore } from 'pinia';
import { computed } from 'vue';
import { useUsersStore } from './users';
import { useOrdersStore } from './orders';

export const useDashboardStore = defineStore('dashboard', () => {
  const usersStore = useUsersStore();
  const ordersStore = useOrdersStore();

  const stats = computed(() => ({
    totalUsers: usersStore.users.length,
    totalOrders: ordersStore.orders.length,
    totalRevenue: ordersStore.orders.reduce((sum, o) => sum + o.amount, 0),
  }));

  const recentActivity = computed(() => {
    const users = usersStore.users.slice(-5).map(u => ({
      type: 'user',
      data: u,
      date: u.createdAt,
    }));

    const orders = ordersStore.orders.slice(-5).map(o => ({
      type: 'order',
      data: o,
      date: o.createdAt,
    }));

    return [...users, ...orders]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  });

  async function initialize() {
    await Promise.all([
      usersStore.fetchUsers(),
      ordersStore.fetchOrders(),
    ]);
  }

  return {
    stats,
    recentActivity,
    initialize,
  };
});
```

## Usage in Components

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';

const dashboardStore = useDashboardStore();
const { stats, recentActivity } = storeToRefs(dashboardStore);

onMounted(() => {
  dashboardStore.initialize();
});
</script>

<template>
  <div>
    <div class="stats">
      <StatCard title="Users" :value="stats.totalUsers" />
      <StatCard title="Orders" :value="stats.totalOrders" />
      <StatCard title="Revenue" :value="stats.totalRevenue" format="currency" />
    </div>

    <ActivityFeed :items="recentActivity" />
  </div>
</template>
```

**Official docs:** https://pinia.vuejs.org/cookbook/composing-stores.html
