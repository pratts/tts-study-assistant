import React from 'react';
import { VStack, Button, Box } from '@chakra-ui/react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FaLock } from 'react-icons/fa';

export default function Sidebar() {
  const { logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', to: '/dashboard', icon: '🏠' },
    { label: 'Notes', to: '/notes', icon: '📝' },
    { label: 'Profile', to: '/profile', icon: '👤' },
  ];

  return (
    <Box bgGradient="linear(to-b, brand.600, brand.500)" color="white" minH="100vh" w="220px" p={6} boxShadow="md">
      <VStack align="stretch" spacing={6}>
        {navItems.map(item => (
          <Button
            as={Link}
            to={item.to}
            key={item.to}
            variant={location.pathname === item.to ? 'solid' : 'ghost'}
            leftIcon={<span>{item.icon}</span>}
            colorScheme="whiteAlpha"
            justifyContent="flex-start"
            fontWeight="bold"
            fontSize="lg"
          >
            {item.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          leftIcon={<FaLock />}
          colorScheme="whiteAlpha"
          justifyContent="flex-start"
          fontWeight="bold"
          fontSize="lg"
          onClick={() => window.open('/privacy-policy', '_blank')}
        >
          Privacy Policy
        </Button>
        <Button
          variant="ghost"
          leftIcon={<span>🚪</span>}
          colorScheme="whiteAlpha"
          justifyContent="flex-start"
          fontWeight="bold"
          fontSize="lg"
          onClick={logout}
        >
          Logout
        </Button>
      </VStack>
    </Box>
  );
} 