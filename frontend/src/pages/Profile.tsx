import React, { useState } from 'react';
import { Box, Heading, Input, Button, VStack, Text, Alert, AlertIcon } from '@chakra-ui/react';
import { updatePassword } from '../api/apiClient';
import { sha256 } from '../utils/hash';

export default function Profile() {
  // Placeholder user data
  const [name] = useState('John Doe');
  const [email] = useState('john@example.com');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const oldHash = await sha256(oldPassword);
      const newHash = await sha256(newPassword);
      await updatePassword(oldHash, newHash);
      setMessage('Password updated!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setError(e.message || 'Failed to update password');
    }
    setLoading(false);
  };

  return (
    <Box>
      <Heading size="lg" mb={6}>Profile</Heading>
      <Box bg="white" borderRadius="md" boxShadow="sm" p={6} maxW="400px">
        <VStack spacing={4} align="stretch">
          <Text fontWeight="bold">Name</Text>
          <Input value={name} readOnly />
          <Text fontWeight="bold">Email</Text>
          <Input value={email} readOnly />
          <form onSubmit={handlePasswordUpdate}>
            <VStack spacing={3} align="stretch">
              <Text fontWeight="bold">Update Password</Text>
              <Input
                placeholder="Old Password"
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
              />
              <Input
                placeholder="New Password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <Input
                placeholder="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {message && <Alert status="success"><AlertIcon />{message}</Alert>}
              {error && <Alert status="error"><AlertIcon />{error}</Alert>}
              <Button type="submit" colorScheme="blue" w="full" isLoading={loading}>Update Password</Button>
            </VStack>
          </form>
        </VStack>
      </Box>
    </Box>
  );
} 