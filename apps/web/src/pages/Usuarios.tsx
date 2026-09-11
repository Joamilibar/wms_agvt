import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser } from '../hooks/useApi';
import { useAuthStore, type Role } from '../stores/auth.store';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Badge from '../components/ui/Badge';
import { HiOutlineUserAdd, HiOutlineBan, HiOutlineRefresh } from 'react-icons/hi';
import { getErrorMessage } from '../lib/errors';

const ROLES: Role[] = ['admin', 'supervisor', 'operator'];

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operator: 'Operador',
};

// The schema mirrors CreateUserDto on the API, so the form rejects what the
// server would reject anyway — without a round trip.
const createUserSchema = z.object({
  name: z.string().min(2, 'Al menos 2 caracteres'),
  email: z.string().email('Correo no válido'),
  password: z.string().min(8, 'Al menos 8 caracteres'),
  role: z.enum(['admin', 'supervisor', 'operator']),
  warehouse: z.string().min(1, 'Indica una bodega'),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  warehouse: string;
  isActive: boolean;
  lastLogin: string | null;
}

export default function Usuarios() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const currentUser = useAuthStore((s) => s.user);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'operator', warehouse: 'Central' },
  });

  const onCreate = handleSubmit(async (values) => {
    try {
      await createUser.mutateAsync(values);
      toast.success(`Usuario ${values.name} creado`);
      reset();
      setShowForm(false);
    } catch (e) {
      toast.error(getErrorMessage(e, 'No se pudo crear el usuario'));
    }
  });

  const onChangeRole = async (user: ApiUser, role: Role) => {
    if (role === user.role) return;
    try {
      await updateUser.mutateAsync({ id: user.id, data: { role } });
      toast.success(`${user.name} ahora es ${ROLE_LABEL[role].toLowerCase()}`);
    } catch (e) {
      toast.error(getErrorMessage(e, 'No se pudo cambiar el rol'));
    }
  };

  const onToggleActive = async (user: ApiUser) => {
    try {
      if (user.isActive) {
        await deactivateUser.mutateAsync(user.id);
        toast.success(`${user.name} quedó sin acceso`);
      } else {
        await updateUser.mutateAsync({ id: user.id, data: { isActive: true } });
        toast.success(`${user.name} recuperó el acceso`);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, 'No se pudo cambiar el estado'));
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const rows: ApiUser[] = users ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Usuarios</h1>
          <p className="text-sm text-text-muted mt-1">
            El registro público crea solo operadores. Las cuentas con rol se administran aquí.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white text-sm font-semibold rounded-lg hover:bg-brand-blue/90 transition-all"
        >
          <HiOutlineUserAdd className="w-4 h-4" />
          {showForm ? 'Cancelar' : 'Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="bg-bg-secondary border border-border-primary rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label htmlFor="user-name" className="block text-xs font-medium text-text-secondary mb-1">Nombre</label>
            <input
              id="user-name"
              {...register('name')}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary"
            />
            {errors.name && <p className="text-xs text-brand-red mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="user-email" className="block text-xs font-medium text-text-secondary mb-1">Correo</label>
            <input
              id="user-email"
              type="email"
              {...register('email')}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary"
            />
            {errors.email && <p className="text-xs text-brand-red mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="user-password" className="block text-xs font-medium text-text-secondary mb-1">Contraseña inicial</label>
            <input
              id="user-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary"
            />
            {errors.password && <p className="text-xs text-brand-red mt-1">{errors.password.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-role" className="block text-xs font-medium text-text-secondary mb-1">Rol</label>
              <select
                id="user-role"
                {...register('role')}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="user-warehouse" className="block text-xs font-medium text-text-secondary mb-1">Bodega</label>
              <input
                id="user-warehouse"
                {...register('warehouse')}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary"
              />
              {errors.warehouse && <p className="text-xs text-brand-red mt-1">{errors.warehouse.message}</p>}
            </div>
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-brand-green text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-brand-green/90 transition-all"
            >
              {isSubmitting ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary">
                {['Nombre', 'Correo', 'Rol', 'Bodega', 'Último ingreso', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="border-b border-border-primary/50 last:border-0">
                    <td className="px-4 py-3 text-text-primary font-medium">
                      {u.name}
                      {isSelf && <span className="ml-2 text-[10px] text-text-muted uppercase tracking-wider">tú</span>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Rol de ${u.name}`}
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => onChangeRole(u, e.target.value as Role)}
                        className="px-2 py-1 bg-bg-tertiary border border-border-primary rounded text-xs text-text-primary disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{u.warehouse}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString('es-CL') : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={u.isActive ? 'Activo' : 'Sin acceso'}
                        variant={u.isActive ? 'green' : 'gray'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onToggleActive(u)}
                        disabled={isSelf}
                        title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
                        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {u.isActive ? <HiOutlineBan className="w-4 h-4" /> : <HiOutlineRefresh className="w-4 h-4" />}
                        {u.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Los roles que no son <span className="font-medium">{ROLE_LABEL.admin.toLowerCase()}</span> se muestran
        atenuados en el menú lateral cuando no alcanzan para una sección. Desactivar conserva el historial:
        las órdenes y guías del usuario mantienen su trazabilidad.
      </p>
    </div>
  );
}
