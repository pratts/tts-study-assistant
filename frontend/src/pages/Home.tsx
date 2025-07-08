import React, { useState } from 'react';
import { Box, Flex, VStack, Heading, Text, Divider, useColorModeValue } from '@chakra-ui/react';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';

export default function Home() {
  const [showRegister, setShowRegister] = useState(false);
  const bg = useColorModeValue('white', 'gray.800');

  return (
    <Flex minH="100vh" align="center" justify="center" bgGradient="linear(to-r, brand.600, brand.500)">
      <Box bg={bg} borderRadius="lg" boxShadow="lg" p={10} minW="800px" maxW="900px" w="full">
        <Flex>
          {/* Left: Branding */}
          <VStack align="center" justify="center" flex={1} spacing={8} pr={8}>
            <Heading size="2xl" color="brand.600">Study Assistant</Heading>
            <Flex fontSize="5xl" gap={4}>
              <span role="img" aria-label="book">📚</span>
              <span role="img" aria-label="notes">📝</span>
              <span role="img" aria-label="headphones over book">🎧</span>
            </Flex>
          </VStack>
          <Divider orientation="vertical" mx={8} />
          {/* Right: Auth */}
          <VStack align="stretch" flex={1} spacing={6}>
            {showRegister ? (
              <RegisterForm onBack={() => setShowRegister(false)} />
            ) : (
              <>
                <LoginForm />
                <Text fontSize="sm" align="center">
                  Don't have an account?{' '}
                  <Text as="span" color="brand.600" cursor="pointer" onClick={() => setShowRegister(true)}>
                    Create here
                  </Text>
                </Text>
              </>
            )}
          </VStack>
        </Flex>
      </Box>
    </Flex>
  );
} 