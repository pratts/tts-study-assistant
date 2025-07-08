import React, { useState } from 'react';
import { Box, Button, Input, VStack, Text } from '@chakra-ui/react';
import { loginApi } from '../../api/apiClient';
import { sha256 } from '../../utils/hash';

interface RegisterFormProps {
  onBack: () => void;
}

export default function RegisterForm({ onBack }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const hashed = await sha256(password);
    const resp = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: hashed })
    });
    const data = await resp.json();
    if (resp.ok && data.data) {
      // Auto-login after registration
      await loginApi(email, hashed);
      window.location.reload();
    } else {
      setError(data.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <Box as="form" onSubmit={handleSubmit}>
      <VStack spacing={4} align="stretch">
        <Input
          placeholder="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <Input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <Text color="red.500">{error}</Text>}
        <Button type="submit" colorScheme="blue" isLoading={loading} w="full">
          Register
        </Button>
        <Button variant="link" onClick={onBack} colorScheme="blue">
          Back to Login
        </Button>
      </VStack>
    </Box>
  );
} 