import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import Sidebar from './Sidebar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Flex minH="100vh">
      <Sidebar />
      <Box flex={1} p={8} bg="#f9fafb">
        {children}
      </Box>
    </Flex>
  );
} 