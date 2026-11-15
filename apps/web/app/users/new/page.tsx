'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useResendInvite } from '@/lib/queries/users';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InviteResult, Role, UserSummary } from '@/lib/types';
import { nativeSelectClass } from '@/components/ui/native-select';

function CreatedNotice({ user, inviteSent }: { user: UserSummary; inviteSent: boolean }) {
  const router = useRouter();
  const resend = useResendInvite(user.id);
  const sent = inviteSent || resend.data?.inviteSent;
  return (
    <Card className="max-w-md">
      <CardContent className="space-y-3 p-6">
        {sent ? (
          <p>Запрошення надіслано на {user.email}</p>
        ) : (
          <>
            <p className="text-destructive">
              Користувача створено, але запрошення не вдалося надіслати на {user.email}.
            </p>
            <Button variant="outline" disabled={resend.isPending} onClick={() => resend.mutate()}>
              Надіслати запрошення ще раз
            </Button>
          </>
        )}
        <div>
          <Button onClick={() => router.push('/kurin')}>До списку</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ZvyazkovyiDirectCreateForm({
  initialHurtokId,
  initialRole,
}: {
  initialHurtokId: string;
  initialRole: Role;
}) {
  const queryClient = useQueryClient();
  const { data: hurtky } = useHurtky();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(initialRole);
  const [hurtokId, setHurtokId] = useState(initialHurtokId);
  const [created, setCreated] = useState<(UserSummary & InviteResult) | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      apiFetch<UserSummary & InviteResult>('/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          hurtokId: hurtokId || undefined,
        }),
      }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreated(user);
    },
  });

  const needsHurtok = role === 'JUNAK';

  if (created) return <CreatedNotice user={created} inviteSent={created.inviteSent} />;

  return (
    <>
      <PageHeader title="Новий користувач" subtitle="Юнак або виховник зʼявиться в курені одразу" crumb={{ href: '/kurin', label: 'Курінь' }} />
      <Card>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUser.mutate();
            }}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-[.8rem]"
          >
            <div className="col-span-full space-y-2">
              <Label htmlFor="role">Роль</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className={nativeSelectClass}
              >
                <option value="JUNAK">Юнак</option>
                <option value="VYKHOVNYK">Виховник</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">Ім&apos;я</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Прізвище</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {needsHurtok && (
              <div className="space-y-2">
                <Label htmlFor="hurtokId">Гурток</Label>
                <select
                  id="hurtokId"
                  value={hurtokId}
                  onChange={(e) => setHurtokId(e.target.value)}
                  required
                  className={nativeSelectClass}
                >
                  <option value="">Оберіть гурток</option>
                  {(hurtky ?? []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {createUser.isError && <p className="col-span-full text-sm text-destructive">Не вдалося створити користувача.</p>}
            <Button type="submit" className="col-span-full justify-self-start" disabled={createUser.isPending}>
              Створити
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function KurinnyiApprovalRequestForm({ initialHurtokId }: { initialHurtokId: string }) {
  const router = useRouter();
  const { data: hurtky } = useHurtky();
  const createRequest = useCreateApprovalRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [hurtokId, setHurtokId] = useState(initialHurtokId);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRequest.mutateAsync({
        actionType: 'CREATE_JUNAK',
        newData: { firstName, lastName, email, hurtokId },
      });
      setSubmitted(true);
    } catch {
      /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
    }
  }

  if (submitted) {
    return (
      <Card className="max-w-md">
        <CardContent className="p-6">
          <p>Запит створено. Юнак з&apos;явиться після затвердження зв&apos;язковим.</p>
          <Button className="mt-4" onClick={() => router.push('/kurin')}>
            До списку
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Запит на створення юнака"
        subtitle="Юнак зʼявиться після затвердження звʼязковим"
        crumb={{ href: '/kurin', label: 'Курінь' }}
      />
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-[.8rem]">
            <div className="space-y-2">
              <Label htmlFor="firstName">Ім&apos;я</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Прізвище</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hurtokId">Гурток</Label>
              <select
                id="hurtokId"
                value={hurtokId}
                onChange={(e) => setHurtokId(e.target.value)}
                required
                className={nativeSelectClass}
              >
                <option value="">Оберіть гурток</option>
                {(hurtky ?? []).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="col-span-full justify-self-start" disabled={createRequest.isPending}>
              Надіслати запит
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export default function NewUserPage() {
  return (
    <Suspense fallback={<p>Завантаження...</p>}>
      <NewUserPageContent />
    </Suspense>
  );
}

function NewUserPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialHurtokId = searchParams.get('hurtokId') ?? '';
  const initialRole = (searchParams.get('role') as Role) ?? 'JUNAK';

  if (session?.role === 'ZVYAZKOVYI') {
    return <ZvyazkovyiDirectCreateForm initialHurtokId={initialHurtokId} initialRole={initialRole} />;
  }
  if (session?.isKurinniy) {
    return <KurinnyiApprovalRequestForm initialHurtokId={initialHurtokId} />;
  }
  return null;
}
