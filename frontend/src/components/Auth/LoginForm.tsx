import React, { useState } from 'react';
import { Box, Button, Input, VStack, Text } from '@chakra-ui/react';
import { useAuth } from '../../context/AuthContext';
import { sha256 } from '../../utils/hash';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const hashed = await sha256(password);
    const success = await login(email, hashed);
    if (!success) setError('Invalid credentials');
    else navigate('/dashboard');
    setLoading(false);
  };

  return (
    <Box as="form" onSubmit={handleSubmit}>
      <VStack spacing={4} align="stretch">
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
          Login
        </Button>
      </VStack>
    </Box>
  );
} 