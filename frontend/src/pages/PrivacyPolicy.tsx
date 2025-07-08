import React from 'react';
import { Box, Heading, Text, VStack } from '@chakra-ui/react';

export default function PrivacyPolicy() {
  return (
    <Box maxW="800px" mx="auto" p={8} bg="white" borderRadius="md" boxShadow="sm">
      <Heading size="lg" mb={4}>Privacy Policy</Heading>
      <VStack align="start" spacing={4}>
        <Text><b>Effective Date:</b> 2024-06-01</Text>
        <Text>
          <b>What We Collect:</b> We collect your email address and password (hashed on your device) for authentication. When you save a note, the selected website content and its source URL are sent to our backend. No other personal, health, financial, or activity data is collected.
        </Text>
        <Text>
          <b>How We Use Data:</b> Your data is used solely to provide the core features of the TTS Study Assistant: saving, organizing, and reading notes aloud. We do not sell or share your data with third parties.
        </Text>
        <Text>
          <b>Storage:</b> Notes and account data are stored securely on our servers. Authentication tokens are stored in your browser for session management.
        </Text>
        <Text>
          <b>User Rights:</b> You may delete your notes or account at any time. Contact support for account deletion requests.
        </Text>
        <Text>
          <b>Extension Permissions:</b> The Chrome extension requests permissions only to access selected text, context menus, and text-to-speech features. No browsing history or personal communications are accessed.
        </Text>
        <Text>
          <b>Contact:</b> For privacy questions, contact: prateeksharma.2801@gmail.com
        </Text>
      </VStack>
    </Box>
  );
} 